void spell_test_purge(int sn, int level, CHAR_DATA *ch, void *vo, int target)
{
    CHAR_DATA *victim = (CHAR_DATA *)vo;

    if (!is_affected(victim, gsn_blindness))
    {
        if (victim == ch)
            send_to_char("You aren't blind.\n\r", ch);
        else
            act("You aren't blind.", ch, NULL, victim, TO_CHAR);
        return;
    }

    if (check_dispel(level, victim, gsn_blindness))
    {
        send_to_char("Your affliction fades!\n\r", victim);
        act("$n looks relieved.", victim, NULL, NULL, TO_ROOM);
    }
    else
        send_to_char("Spell failed.\n\r", ch);
}