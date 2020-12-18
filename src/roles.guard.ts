import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { get, intersection } from 'lodash';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const roles =
      this.reflector.get<string[]>('roles', context.getHandler()) ??
      this.reflector.get<string[]>('roles', context.getClass());
    if (!roles) return true;
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    // const response = ctx.getResponse();
    return 0 < intersection(roles, get(request, 'user.roles', [])).length;
  }
}
