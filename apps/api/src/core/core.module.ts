import { Module } from '@nestjs/common';
import { AdminSettingsController } from './admin/admin-settings.controller';
import { AdminSettingsService } from './admin/admin-settings.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { AuthController } from './auth/auth.controller';
import { DashboardController } from './dashboard/dashboard.controller';
import { HealthController } from './health.controller';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { ScheduleController } from './schedule/schedule.controller';
import { ScheduleService } from './schedule/schedule.service';
import { TenantService } from './tenant.service';

/** 비즈니스 로직. 외부 시스템은 ports/ 인터페이스로만 사용합니다. */
@Module({
  controllers: [
    HealthController,
    AuthController,
    AttendanceController,
    LeaveController,
    ScheduleController,
    DashboardController,
    AdminSettingsController,
  ],
  providers: [TenantService, AdminSettingsService, AttendanceService, LeaveService, ScheduleService],
})
export class CoreModule {}
