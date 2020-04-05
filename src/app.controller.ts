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
import { WordartService } from './wordart.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly wordartService: WordartService,
  ) {}

  @Get()
  get() {
    return { status: 200 };
  }

  @Get('search')
  @UseInterceptors(CacheInterceptor)
  async search(@Query('query') query: string = '') {
    return await this.appService.search(query);
  }

  @Get('wordart')
  async wordart(@Query('key') key: string = '') {
    return this.wordartService.wordart(key);
  }

  @Get('user')
  @Roles('user')
  @UseGuards(AuthGuard(), RolesGuard)
  user(@User('_id') _id: string) {
    return _id;
  }
}
