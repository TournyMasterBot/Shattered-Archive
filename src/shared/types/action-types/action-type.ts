enum ActionType {
    Move = 0 << 1,
    Dig = 1 << 1,
    Kill = 2 << 1,
    Get = 3 << 1,
    Say = 4 << 1
}

export default ActionType;