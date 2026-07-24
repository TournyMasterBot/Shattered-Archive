void spell_test_mend(int sn, int level, CHAR_DATA *ch, void *vo, int target)
{
    CHAR_DATA *victim = (CHAR_DATA *)vo;
    int heal;

    heal = dice(1, 8) + level / 3;
    victim->hit = UMIN(victim->hit + heal, victim->max_hit);
    update_pos(victim);
    send_to_char("You feel better!\n\r", victim);
    if (ch != victim)
        send_to_char("Ok.\n\r", ch);
    return;
}