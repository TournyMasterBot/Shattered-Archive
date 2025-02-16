import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Displacement implements IAbility {
    private static instance: Displacement;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Displacement";
        this.helpFile = `
displacement
c 'displacement' <target>

Displacement, if successful, allows a priest to send a victim back to their
point of recall.
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Displacement.instance === undefined) {
            Displacement.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Displacement {
        if (!Displacement.instance) {
            Displacement.instance = new Displacement();
        }
        return Displacement.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Displacement.GetInstance() as T;
    }
}

export default Displacement;