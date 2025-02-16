import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class NatureGrowth implements IAbility {
    private static instance: NatureGrowth;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Nature Growth";
        this.helpFile = `
help 'Nature Growth'
NATURE GROWTH
Syntax: cast 'nature growth' <target>

Nature growth is one of the earliest spells in a druid's or ranger’s cache
of magical texts, able to cast the spell not only upon oneself but on to
other targets as well. As the caster calls upon Nature’s elements, all its
forces gather within the directed target, giving a temporary boost to their
constitution. The magic is not powerful enough to manipulate a person’s
constitution to go beyond what is intended upon their creation.

Groups containing this skill: 'NATURE' 'DRUID DEFAULT' 'RANGER DEFAULT'
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (NatureGrowth.instance === undefined) {
            NatureGrowth.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): NatureGrowth {
        if (!NatureGrowth.instance) {
            NatureGrowth.instance = new NatureGrowth();
        }
        return NatureGrowth.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return NatureGrowth.GetInstance() as T;
    }
}

export default NatureGrowth;