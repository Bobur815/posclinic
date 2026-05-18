import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsNumber, Min } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty({ example: 130000, description: 'Amount being paid now (in UZS)' })
  @IsNumber()
  @Min(0)
  amount!: number;
}
