import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Circle implements IAbility {
    private static instance: Circle;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Circle";
        this.helpFile = `
circle
The circling tactic is a manuever of the Bladesong in which the bladesinger
nimbly disorients the victim by quickly circling them.  It's been told that
though all bladesingers learn this method, that Shalonesti elves are often
just slightly more profiecient in it's movements.  
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (Circle.instance === undefined) {
            Circle.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): Circle {
        if (!Circle.instance) {
            Circle.instance = new Circle();
        }
        return Circle.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Circle.GetInstance() as T;
    }
}

export default Circle;