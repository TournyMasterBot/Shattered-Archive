import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BlessingOfPeace implements IAbility {
    private static instance: BlessingOfPeace;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Blessing of Peace";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help 'Blessing of Peace'
BLESSING OF PEACE

Syntax: cast 'blessing of peace' <character>

This blessing fills those granted with the essence of the ancients. It will
improve their ability to resist magical spells and effects.  

Groups containing this skill: SHUKENJA 
`;

        if (BlessingOfPeace.instance === undefined) {
            BlessingOfPeace.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): BlessingOfPeace {
        if (!BlessingOfPeace.instance) {
            BlessingOfPeace.instance = new BlessingOfPeace();
        }
        return BlessingOfPeace.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return BlessingOfPeace.GetInstance() as T;
    }
}

export default BlessingOfPeace;