import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class LocateEmpower implements IAbility {
    private static instance: LocateEmpower;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Locate Empower";
        this.helpFile = `
locate empower
Syntax: c 'locate empower'

Locate empower is a spell which enables Paladins to find empowers held on
those across Algoron. Locate empower is unique from locate object, as it
finds the name of the weapon empowered, as well as who bears it.
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (LocateEmpower.instance === undefined) {
            LocateEmpower.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): LocateEmpower {
        if (!LocateEmpower.instance) {
            LocateEmpower.instance = new LocateEmpower();
        }
        return LocateEmpower.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return LocateEmpower.GetInstance() as T;
    }
}

export default LocateEmpower;