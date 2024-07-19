export type PyWorkRequest = {
    id: number,
    name: string,
    data: unknown,
}
export type PyWorkProgress = {
    type: 'p',
    id: number,
    progress: number,
}
export type PyWorkResponse = {
    type: 'r'
    id: number,
    data: unknown,
}

declare const tag_PyWorkRef: unique symbol;
export type PyWorkRef = number & { [tag_PyWorkRef]: null };
