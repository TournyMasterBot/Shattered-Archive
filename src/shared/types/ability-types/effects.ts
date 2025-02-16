const enum SkillSpellEffects
{
    Unknown = 0,
    Damage = 1 << 0,
    Maladiction = 1 << 1,
    Buff = 1 << 2,
    Utility = 1 << 3
}

export default SkillSpellEffects;