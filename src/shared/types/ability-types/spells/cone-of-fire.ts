import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ConeOfFire implements IAbility {
    private static instance: ConeOfFire;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Cone of Fire";
        this.helpFile = `
CONE OF FIRE

Syntax: cast 'cone of fire'

By drawing on enormous amounts of energy, the Invoker calls into being a
cone of extreme heat and flame from the bowels of the realm. The
temperatures affect all that are in the same room as the Invoker, save for
those the invoker is grouped with.  

See also: INVOKER 
`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (ConeOfFire.instance === undefined) {
            ConeOfFire.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): ConeOfFire {
        if (!ConeOfFire.instance) {
            ConeOfFire.instance = new ConeOfFire();
        }
        return ConeOfFire.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ConeOfFire.GetInstance() as T;
    }
}

export default ConeOfFire;