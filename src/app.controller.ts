import { Controller, Get, Logger } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  index() {
    return { status: 200 };
  }

  @Get('update')
  async update() {
    setTimeout(async () =>
      Logger.log(await this.appService.update(), 'AppController/update'),
    );
    return true;
  }
}
