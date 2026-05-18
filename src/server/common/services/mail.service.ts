import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

function bool(v: string | undefined, def = false) {
  if (v === undefined) return def;
  return String(v).toLowerCase() === 'true';
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: bool(process.env.SMTP_SECURE, false),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendOtpCode(to: string, otp: string) {
    const subject = 'Tasdiqlash kodi / OTP Code';
    const text = `Tasdiqlash kodingiz: ${otp}  (2 daqiqa amal qiladi)`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height:1.6">
        <h2>Tasdiqlash kodi</h2>
        <p>Quyidagi tasdiqlash kodini kiriting:</p>
        <div style="font-size:24px; font-weight:700; letter-spacing:4px;">${otp}</div>
        <p style="color:#666">Kod 2 daqiqa ichida amal qiladi. Hech kimga bermang.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? '"POSCLINIC" <no-reply@posclinic.uz>',
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      console.error('EMAIL ERROR:', err);
      throw new InternalServerErrorException('Email yuborishda xatolik yuz berdi');
    }
  }

  async sendPasswordResetOtp(to: string, otp: string, userName?: string) {
    const subject = 'Password Reset Code';
    const text = `Your password reset code: ${otp}. This code will expire in 10 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">Password Reset Request</h1>
          </div>

          ${userName ? `<p style="color: #555; font-size: 16px;">Hello ${userName},</p>` : ''}

          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            We received a request to reset your password. Use the verification code below to reset your password:
          </p>

          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2c3e50;">${otp}</div>
          </div>

          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>Important:</strong> This code will expire in <strong>10 minutes</strong>.
              Do not share this code with anyone.
            </p>
          </div>

          <p style="color: #777; font-size: 14px; line-height: 1.6; margin-top: 30px;">
            If you didn't request a password reset, please ignore this email or contact support if you have concerns.
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

          <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? '"POSCLINIC" <no-reply@posclinic.uz>',
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      console.error('PASSWORD RESET EMAIL ERROR:', err);
      throw new InternalServerErrorException('Failed to send password reset email');
    }
  }
}
