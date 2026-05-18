import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Redirect,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  ChangePasswordResponse,
  CreateClinicResponse,
  ElectronSetupResponse,
  LoginResponse,
  LogoutResponse,
  ProfileResponse,
  RequestOtpResponse,
  RequestUser,
  SetPasswordResponse,
  SuccessMessageResponse,
  VerifyOtpResponse,
} from '../../common/interfaces';
import { AuthService } from './auth.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { LoginDto } from './dto/login.dto';
import type { ElectronSetupDto } from './dto/register.dto';
import type { RequestOtpDto } from './dto/request-otp.dto';
import type { CreateClinicDto, SetPasswordDto } from './dto/set-password.dto';
import type { ResetPasswordDto, VerifyOtpDto } from './dto/verify-otp.dto';
import type { GoogleUser } from './jwt/google.strategy';
import { JwtAuthGuard } from './jwt/jwt-auth.guard';

interface AuthRequest {
  user: RequestUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // ── Credentials ──────────────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('electron/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Electron app setup — validates clinicCode + credentials, returns 30-day token',
  })
  @ApiResponse({ status: 200, description: 'Setup successful' })
  @ApiResponse({ status: 404, description: 'Clinic code not found' })
  electronSetup(@Body() dto: ElectronSetupDto): Promise<ElectronSetupResponse> {
    return this.authService.electronSetup(dto);
  }

  // ── OTP: Email Verification ──────────────────────────────────────────────────

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP for email verification',
    description:
      'Works for both new and existing (unverified) users. Step 1 of new-user onboarding.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent to email' })
  @ApiResponse({
    status: 400,
    description: 'Email already registered and verified — use login instead',
  })
  requestOtp(@Body() dto: RequestOtpDto): Promise<RequestOtpResponse> {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email);
    if (!validEmail) {
      return Promise.reject({
        status: HttpStatus.BAD_REQUEST,
        message: 'invalidEmail',
      });
    }
    return this.authService.requestOtp(dto.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP — step 2 of onboarding',
    description:
      'For NEW users: returns `{ isNewUser: true, registrationToken }` — pass this token to /auth/set-password.\n' +
      'For existing users: marks email verified and returns `{ isNewUser: false }`.',
  })
  @ApiResponse({ status: 200, description: 'OTP verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResponse> {
    return this.authService.verifyOtp(dto.email, dto.code);
  }

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set password — step 3 of onboarding (new users only)',
    description:
      'Requires `registrationToken` from /auth/verify-otp. Returns `setupToken` for the next step.',
  })
  @ApiResponse({ status: 200, description: 'Returns setupToken' })
  @ApiResponse({ status: 401, description: 'Invalid or expired registrationToken' })
  setPassword(@Body() dto: SetPasswordDto): Promise<SetPasswordResponse> {
    return this.authService.setPassword(
      dto.registrationToken,
      dto.password,
      dto.firstName,
      dto.lastName,
    );
  }

  @Post('create-clinic')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create clinic / organization — final step of onboarding',
    description:
      'Requires `setupToken` from /auth/set-password. Creates Tenant + SUPERADMIN user and returns full auth token.',
  })
  @ApiResponse({ status: 201, description: 'Tenant and user created — returns JWT token' })
  @ApiResponse({ status: 401, description: 'Invalid or expired setupToken' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  createClinic(@Body() dto: CreateClinicDto): Promise<CreateClinicResponse> {
    return this.authService.createClinic(dto.setupToken, dto.organizationName, {
      organizationNameUz: dto.organizationNameUz,
      organizationNameRu: dto.organizationNameRu,
      contactPhone: dto.contactPhone,
      address: dto.address,
      city: dto.city,
      region: dto.region,
    });
  }

  // ── OTP: Password Reset ──────────────────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset OTP to email' })
  @ApiResponse({ status: 200, description: 'Reset code sent if email exists' })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<SuccessMessageResponse> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using OTP code' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset code' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<SuccessMessageResponse> {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth login' })
  googleAuth() {
    // Passport redirects — no body needed
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @Redirect()
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@Request() req: { user: GoogleUser }): Promise<{ url: string }> {
    const result = await this.authService.googleLogin(req.user);
    const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
    return { url: `${webUrl}/auth/google/success?token=${result.token}` };
  }

  // ── Profile & Session ────────────────────────────────────────────────────────

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current authenticated user' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@Request() req: AuthRequest): Promise<ProfileResponse> {
    return this.authService.getProfile(req.user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout — client should discard the token' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  logout(): LogoutResponse {
    return { success: true };
  }

  @Put('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Wrong current password' })
  changePassword(
    @Request() req: AuthRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
