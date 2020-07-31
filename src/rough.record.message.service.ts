import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { map, publishReplay, refCount, scan } from 'rxjs/operators';

import { tweetInterface } from './twitter.interface';

const initialMessages: tweetInterface[] = [];

interface MessageOperation {
  (messages: tweetInterface[]): tweetInterface[];
}

@Injectable()
export class RoughRecordMessageService {
  private deleteMessage = new Subject<tweetInterface>();
  private insert = new Subject<tweetInterface>();
  messages: Observable<tweetInterface[]>;
  private newMessage = new Subject<tweetInterface>();
  private remove = new Subject<tweetInterface>();
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

  addMessage(message: tweetInterface) {
    this.newMessage.next(message);
  }

  removeMessage(message: tweetInterface) {
    this.deleteMessage.next(message);
  }
}
