import {
  CacheInterceptor,
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AppService } from './app.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { User } from './user.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  get() {
    return { status: 200 };
  }

  @Get('wordart')
  async wordart(@Query('key') key: string = '') {
    return this.appService.wordart(key);
  }

  @Get('search')
  @UseInterceptors(CacheInterceptor)
  async search(@Query('key') key: string = '') {
    return this.appService.search(key);
  }

  @Get('user')
  @Roles('user')
  @UseGuards(AuthGuard(), RolesGuard)
  user(@User('_id') _id: string) {
    return _id;
  }
}
