import { INodeConnectionOpts, TAddUsersToNodeRequest } from '@common/axios';

export interface IAddUsersToNodePayload {
    data: TAddUsersToNodeRequest;
    node: INodeConnectionOpts;
}
