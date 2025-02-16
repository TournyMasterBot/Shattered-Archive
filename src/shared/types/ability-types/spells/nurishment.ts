import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Nourishment implements IAbility {
    private static instance: Nourishment;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Nourishment";
        this.helpFile = `
NOURISHMENT

Syntax: cast 'nourishment' <target>

Nourishment allows a priest to relieve all hunger and thirst from an
individual, leaving them fully nourished.

SEE ALSO: PRIEST, DIVINE BLESSING
        `;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Nourishment.instance === undefined) {
            Nourishment.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Nourishment {
        if (!Nourishment.instance) {
            Nourishment.instance = new Nourishment();
        }
        return Nourishment.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Nourishment.GetInstance() as T;
    }
}

export default Nourishment;