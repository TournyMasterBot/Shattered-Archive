import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Pugil implements IAbility {
    private static instance: Pugil;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Pugil";
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
help Pugil
pugil
Using a staff, the attempt is made to do a quick combination hit with
alternate ends of the staff. This is done with a quick punching movement
from each hand.
        `;

        if (Pugil.instance === undefined) {
            Pugil.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Pugil {
        if (!Pugil.instance) {
            Pugil.instance = new Pugil();
        }
        return Pugil.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Pugil.GetInstance() as T;
    }
}

export default Pugil;