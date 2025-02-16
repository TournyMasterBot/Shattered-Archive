import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Riot implements IAbility {
    private static instance: Riot;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Riot";
        this.helpFile = `
riot
The bandit has the ability to instill a riot mentality within a certain
group that he is associated with. Those that are enraged by the bandit
fight with more fury.  
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (Riot.instance === undefined) {
            Riot.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Riot {
        if (!Riot.instance) {
            Riot.instance = new Riot();
        }
        return Riot.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Riot.GetInstance() as T;
    }
}

export default Riot;