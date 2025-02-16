import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Camouflage implements IAbility {
    private static instance: Camouflage;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Camouflage";
        this.helpFile = `
help camouflage
CAMOUFLAGE
Syntax:  camouflage
Camouflage is the art of hiding yourself in natural surroundings.  Only
Rangers are able to use this skill, and even they can only use it in outdoors
settings.  Like the hide skill, it is not possible to determine whether or
not your attempts to camouflage yourself have been successful, and any 
movement will reveal your location.
This skill is very useful in combination with the ambush skill and is
required for an ambush attempt to be successful.
See also:  RANGER  AMBUSH
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Active;
        this.manualDescription = "";

        if (Camouflage.instance === undefined) {
            Camouflage.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Camouflage {
        if (!Camouflage.instance) {
            Camouflage.instance = new Camouflage();
        }
        return Camouflage.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Camouflage.GetInstance() as T;
    }
}

export default Camouflage;