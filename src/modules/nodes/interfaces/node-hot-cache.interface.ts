import { TConfigProfileCoreType } from '@libs/contracts/constants';

import { INodeSystem } from './node-host-info.interface';

export interface INodeVersions {
    coreType?: TConfigProfileCoreType;
    core?: string;
    xray: string;
    singbox?: string;
    node: string;
}

export interface INodeHotCache {
    system: INodeSystem | null;
    versions: INodeVersions | null;
    xrayUptime: number;
    onlineUsers: number;
}
