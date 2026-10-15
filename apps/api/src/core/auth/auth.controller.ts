import { Body, Controller, Get, HttpCode, Inject, Post, Res, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import bcrypt from 'bcryptjs';
import { and, departments, eq, tenants, users, type Database } from '@erm/db';
import { loginSchema, type MeDto } from '@erm/shared';
import { APP_CONFIG, type AppConfig } from '../../config';
import { CurrentUser, Public, SESSION_COOKIE, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { DB } from '../../infra/tokens';

const SESSION_HOURS = 12;
/** 존재하지 않는 계정에도 같은 시간을 쓰도록 비교용 해시 */
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<MeDto> {
    const input = parseBody(loginSchema, body);
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email.toLowerCase()), eq(users.status, 'ACTIVE')));

    const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const token = await this.jwt.signAsync(
      { sub: user.id, tid: user.tenantId, role: user.role },
      { expiresIn: `${SESSION_HOURS}h` },
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.cookieSecure,
      maxAge: SESSION_HOURS * 3600 * 1000,
      path: '/',
    });
    return this.me({ userId: user.id, tenantId: user.tenantId, role: user.role });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  async me(@CurrentUser() auth: AuthUser): Promise<MeDto> {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        departmentName: departments.name,
        tenantName: tenants.name,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(eq(users.id, auth.userId), eq(users.tenantId, auth.tenantId)));
    if (!row) throw new UnauthorizedException();
    return { ...row, departmentName: row.departmentName ?? null };
  }
}
