import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DarkVision implements IAbility {
    private static instance: DarkVision;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;
    manualDescription: string;

    constructor() {
        this.name = "Dark Vision";
        this.helpFile = `
help 'dark vision'
'DARKVISION' 'DARK VISION'
DARKVISION, DARK VISION
Darkvision is a skill which allows those who have it to see in the dark. 
This frees these characters from any need to carry a light source to 
see at night and in dark rooms. (Skill currently only works when 
trained to 75%)
`;
        this.abilityGroupType = AbilityGroupType.Skills;
        this.abilityUsage = AbilityUsage.Passive;
        this.manualDescription = "";

        if (DarkVision.instance === undefined) {
            DarkVision.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): DarkVision {
        if (!DarkVision.instance) {
            DarkVision.instance = new DarkVision();
        }
        return DarkVision.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return DarkVision.GetInstance() as T;
    }
}

export default DarkVision;