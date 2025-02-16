import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Suffocate implements IAbility {
    private static instance: Suffocate;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Suffocate";
        this.helpFile =
`help wujen
Suffocate - Drawing all of the room in the air into themselves, a Wu Jen can
create a temporary vacuum, stifling the breath of anyone not grouped with
them.  Affected foes begin to take damage similar to drowning underwater for
a short time, the amount of harm done proportional to their health.`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Suffocate.instance === undefined) {
            Suffocate.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Suffocate {
        if (!Suffocate.instance) {
            Suffocate.instance = new Suffocate();
        }
        return Suffocate.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Suffocate.GetInstance() as T;
    }
}

export default Suffocate;