export type ListenerEntry = {
  target: EventTarget;
  name: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
  stack?: string;
};