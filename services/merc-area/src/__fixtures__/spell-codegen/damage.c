void spell_test_bolt(int sn, int level, CHAR_DATA *ch, void *vo, int target)
{
    CHAR_DATA *victim = (CHAR_DATA *)vo;
    int dam;

    dam = dice(6 + level / 2, 8);
    if (saves_spell(level, victim, DAM_FIRE))
        dam /= 2;
    damage(ch, victim, dam, sn, DAM_FIRE, TRUE);
    return;
}