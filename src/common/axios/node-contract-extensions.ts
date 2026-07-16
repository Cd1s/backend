import { AddUserCommand, AddUsersCommand } from '@remnawave/node-contract';

export type TAddUserToNodeRequest = Omit<AddUserCommand.Request, 'data'> & {
    data: Array<
        | AddUserCommand.Request['data'][number]
        | {
              type: 'anytls';
              tag: string;
              username: string;
              password: string;
          }
    >;
};

type TAnyTlsBulkInbound = {
    type: 'anytls';
    tag: string;
};

export type TAddUsersToNodeRequest = Omit<AddUsersCommand.Request, 'users'> & {
    users: Array<
        Omit<AddUsersCommand.Request['users'][number], 'inboundData'> & {
            inboundData: Array<
                AddUsersCommand.Request['users'][number]['inboundData'][number] | TAnyTlsBulkInbound
            >;
        }
    >;
};
