import { INodeConnectionOpts, TAddUserToNodeRequest } from '@common/axios';

export interface IAddUserToNodePayload {
    data: TAddUserToNodeRequest;
    node: INodeConnectionOpts;
}
