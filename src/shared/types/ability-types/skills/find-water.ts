import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class FindWater implements IAbility {
    private static instance: FindWater;

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
        this.name = "Find Water";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `help 'find water'
FIND WATER
Syntax: find water
Find water is a skill available only to rangers and shamans. They may use
their knowledge of natural surroundings to find small springs or other
sources of water that might remain hidden from other adventurers.
 
see also: 'RANGER' 'SHAMAN'`;

        if (FindWater.instance === undefined) {
            FindWater.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): FindWater {
        if (!FindWater.instance) {
            FindWater.instance = new FindWater();
        }
        return FindWater.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return FindWater.GetInstance() as T;
    }
}

export default FindWater;