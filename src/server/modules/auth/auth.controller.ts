import { Controller, Post, Body, UseGuards, Request, Put } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { phone: string; password: string; clinicId: string }) {
    return this.authService.login(body.phone, body.password, body.clinicId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('profile')
  getProfile(@Request() req: { user: unknown }) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Put('change-password')
  changePassword(
    @Request() req: { user: { id: string } },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }
}
