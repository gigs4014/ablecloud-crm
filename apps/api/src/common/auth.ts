import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '@erm/shared';

export const SESSION_COOKIE = 'erm_session';

/** 로그인한 사용자 정보. 모든 서비스 호출에 tenantId 범위로 전달됩니다. */
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

const IS_PUBLIC = 'isPublic';
const ROLES = 'roles';

/** 로그인 없이 호출 가능한 API */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** 특정 역할만 호출 가능한 API */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new UnauthorizedException();
  return req.user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  return ctx.switchToHttp().getRequest<Request>().ip;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; tid: string; role: Role }>(token);
      req.user = { userId: payload.sub, tenantId: payload.tid, role: payload.role };
    } catch {
      throw new UnauthorizedException('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenException('권한이 없습니다.');
    return true;
  }
}
