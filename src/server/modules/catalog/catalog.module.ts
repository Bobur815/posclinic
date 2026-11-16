import { Module } from '@nestjs/common';
import {
  DoctorsController,
  ServicesController,
  TypesController,
  UsersController,
} from './catalog.controllers';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [ServicesController, DoctorsController, UsersController, TypesController],
  providers: [CatalogService],
})
export class CatalogModule {}
