import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class WeCome implements IAbility {
    private static instance: WeCome;

    name: string;
    helpFile: string;
    manualDescription?: string | undefined;
    duration?: number | undefined;
    effects?: SkillSpellEffects | undefined;
    group?: string | undefined;
    alternateKeyword?: string | undefined;
    recommendedHelpFileChanges?: string | undefined;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "We Come, We Come";
        this.abilityGroupType = AbilityGroupType.Songs;
        this.abilityUsage = AbilityUsage.Active;
        this.helpFile = `
We Come, We Come - The strong tempo of this song will enrage the 
group and allow them to strike harder and with more accuracy against the 
enemy, however, as their focus is clouded by their aggressive actions in 
battle it leaves their defenses more vulnerable while under this song's 
influence.
`;

        if (WeCome.instance === undefined) {
            WeCome.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): WeCome {
        if (!WeCome.instance) {
            WeCome.instance = new WeCome();
        }
        return WeCome.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return WeCome.GetInstance() as T;
    }
}

export default WeCome;