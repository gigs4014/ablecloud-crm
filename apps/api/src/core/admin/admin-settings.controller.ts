import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { adminSettingsUpdateSchema, integrationTestSchema } from '@erm/shared';
import { ClientIp, CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { AdminSettingsService } from './admin-settings.service';

@Roles('ADMIN')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @ClientIp() ip?: string) {
    return this.settings.get(user, ip);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() body: unknown, @ClientIp() ip?: string) {
    return this.settings.update(user, parseBody(adminSettingsUpdateSchema, body), ip);
  }

  @Post('integration/test')
  @HttpCode(200)
  test(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.settings.test(user, parseBody(integrationTestSchema, body).target);
  }
}
