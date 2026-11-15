import { Module } from '@nestjs/common';
import { DoctorsController, ServicesController, UsersController } from './catalog.controllers';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [ServicesController, DoctorsController, UsersController],
  providers: [CatalogService],
})
export class CatalogModule {}
