import { Controller, Get, Logger, Query } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  get() {
    return { status: 200 };
  }

  @Get('update')
  async update() {
    return await this.appService.update();
  }

  @Get('wordart')
  async wordart(@Query('key') key: string = '') {
    return this.appService.wordart(key);
  }
}
