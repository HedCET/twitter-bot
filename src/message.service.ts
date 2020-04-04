import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map, publishReplay, refCount, scan } from 'rxjs/operators';

import { search_res_statuses } from './twitter.interface';

const initialMessages: search_res_statuses[] = [];

interface MessageOperation {
  (messages: search_res_statuses[]): search_res_statuses[];
}

@Injectable()
export class MessageService {
  private deleteMessage = new Subject<search_res_statuses>();
  private insert = new Subject<search_res_statuses>();
  messages: Observable<search_res_statuses[]>;
  private newMessage = new Subject<search_res_statuses>();
  private remove = new Subject<search_res_statuses>();
  private update = new Subject<MessageOperation>();

  constructor() {
    this.messages = this.update.pipe(
      scan((messages, operation) => operation(messages), initialMessages),
      publishReplay(1),
      refCount(),
    );

    this.newMessage.subscribe(this.insert);
    this.insert
      .pipe(map(message => messages => messages.concat(message)))
      .subscribe(this.update);

    this.deleteMessage.subscribe(this.remove);
    this.remove
      .pipe(
        map(message => messages =>
          messages.filter(item => message.id_str != item.id_str),
        ),
      )
      .subscribe(this.update);
  }

  addMessage(message: search_res_statuses) {
    this.newMessage.next(message);
  }

  removeMessage(message: search_res_statuses) {
    this.deleteMessage.next(message);
  }
}
