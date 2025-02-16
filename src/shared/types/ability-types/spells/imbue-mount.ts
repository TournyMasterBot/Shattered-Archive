import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ImbueMount implements IAbility {
    private static instance: ImbueMount;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Imbue Mount";
        this.helpFile = `
IMBUE MOUNT

Through extensive training in the art of mounted combat, the crusader has
learned how to infuse holy energy into their mount, healing and making it
tougher.  Imbue Mount is part of the Worship spellgroup and is only
accessible to the Crusader class.  
 
cast 'imbue' <mount>
`;
        this.manualDescription = "";
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (ImbueMount.instance === undefined) {
            ImbueMount.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): ImbueMount {
        if (!ImbueMount.instance) {
            ImbueMount.instance = new ImbueMount();
        }
        return ImbueMount.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return ImbueMount.GetInstance() as T;
    }
}

export default ImbueMount;