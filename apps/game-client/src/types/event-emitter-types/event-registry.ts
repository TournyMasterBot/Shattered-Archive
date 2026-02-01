import { ListenerEntry } from './listener-entry';

export type Registry = {
  listeners: Map<string, ListenerEntry>;
};
