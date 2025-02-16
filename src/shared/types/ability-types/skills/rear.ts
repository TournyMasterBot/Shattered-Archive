import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Rear implements IAbility {
    private static instance: Rear;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Rear";
        this.helpFile = `
REAR

The seasoned crusader has learned over time how to pull back on their
mount's reigns causing their mount to rear and lash out with its front
hooves at its opponent. If successful, the attack has a chance of
stunning the target as well as causing mild damage.

syntax: rear <target> or just rear during combat
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;

        if (Rear.instance === undefined) {
            Rear.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Rear {
        if (!Rear.instance) {
            Rear.instance = new Rear();
        }
        return Rear.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Rear.GetInstance() as T;
    }
}

export default Rear;