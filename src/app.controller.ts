import { Controller, Get, Logger, Query } from '@nestjs/common';

import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  index() { return { message: 'User' }; }

  @Get('update')
  async update(@Query('services') services = 'favorite') {
    setTimeout(async () => Logger.log(await this.appService.update(services.split('|')), 'AppController/update'));
    return true;
  }
}
