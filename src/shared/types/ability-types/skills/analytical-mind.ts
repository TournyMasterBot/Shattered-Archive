import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class AnalyticalMind implements IAbility {
    private static instance: AnalyticalMind;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Analytical Mind";
        this.helpFile =
`help mentalist
Analytical Mind - a chance to cast without lag in combat`;

        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;

        if (AnalyticalMind.instance === undefined) {
            AnalyticalMind.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): AnalyticalMind {
        if (!AnalyticalMind.instance) {
            AnalyticalMind.instance = new AnalyticalMind();
        }
        return AnalyticalMind.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return AnalyticalMind.GetInstance() as T;
    }
}

export default AnalyticalMind;