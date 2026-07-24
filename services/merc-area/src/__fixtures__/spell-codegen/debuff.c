void spell_test_daze(int sn, int level, CHAR_DATA *ch, void *vo, int target)
{
    CHAR_DATA *victim = (CHAR_DATA *)vo;
    AFFECT_DATA af;

    if (IS_AFFECTED(victim, AFF_BLIND) || saves_spell(level, victim, DAM_OTHER))
        return;

    af.where = TO_AFFECTS;
    af.type = sn;
    af.level = level;
    af.location = APPLY_HITROLL;
    af.modifier = -4;
    af.duration = 1 + level;
    af.bitvector = AFF_BLIND;
    affect_to_char(victim, &af);
    send_to_char("You are dazed!\n\r", victim);
    act("$n looks dazed.", victim, NULL, NULL, TO_ROOM);
    return;
}