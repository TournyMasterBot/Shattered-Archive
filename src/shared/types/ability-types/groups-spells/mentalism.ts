import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import HealingDream from "@shared/types/ability-types/spells/healing-dream";
import Haze from "@shared/types/ability-types/spells/haze";
import Recover from "@shared/types/ability-types/spells/recover";
import FocusedAggression from "@shared/types/ability-types/spells/focused-aggression";
import FakeIllness from "@shared/types/ability-types/spells/fake-illness";
import AbandonHope from "@shared/types/ability-types/spells/abandon-hope";
import InfluenceConfidence from "@shared/types/ability-types/spells/influence-confidence";
import Amnesia from "@shared/types/ability-types/spells/amnesia";
import Distortion from "@shared/types/ability-types/spells/distortion";

export class Mentalism implements IAbilityGroup {
    static instance: Mentalism;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Mentalism;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            HealingDream.GetInstance().Get(),
            Haze.GetInstance().Get(),
            Recover.GetInstance().Get(),
            FocusedAggression.GetInstance().Get(),
            FakeIllness.GetInstance().Get(),
            AbandonHope.GetInstance().Get(),
            InfluenceConfidence.GetInstance().Get(),
            Amnesia.GetInstance().Get(),
            Distortion.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Mentalism {
        if (!Mentalism.instance) {
            Mentalism.instance = new Mentalism();
        }
        return Mentalism.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Mentalism.GetInstance() as T;
    }
}

export default Mentalism;
