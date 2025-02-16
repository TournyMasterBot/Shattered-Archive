import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Poultice implements IAbility {
    private static instance: Poultice;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Poultice";
        this.helpFile = `help help Poultice
poultice
Primitive witch doctors may bind and treat the wounds of their tribe
with a messy poultice of magical plants. While not as effective as true
clerical healing, this primitive healing art can be useful indeed.
No help on that word.`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (Poultice.instance === undefined) {
            Poultice.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Poultice {
        if (!Poultice.instance) {
            Poultice.instance = new Poultice();
        }
        return Poultice.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Poultice.GetInstance() as T;
    }
}

export default Poultice;