import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class TimeStop implements IAbility {
    private static instance: TimeStop;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Time Stop";
        this.helpFile = ``;
        this.manualDescription = ``;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (TimeStop.instance === undefined) {
            TimeStop.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): TimeStop {
        if (!TimeStop.instance) {
            TimeStop.instance = new TimeStop();
        }
        return TimeStop.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return TimeStop.GetInstance() as T;
    }
}

export default TimeStop;