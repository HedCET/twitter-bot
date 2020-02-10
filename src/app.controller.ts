import {
  CacheInterceptor,
  Controller,
  Get,
  Query,
  UseInterceptors,
} from '@nestjs/common';

import { AppService } from './app.service';

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
}
