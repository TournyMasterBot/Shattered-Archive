import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Toss from "@shared/types/ability-types/skills/toss";
import ApplyPotion from "@shared/types/ability-types/skills/apply-potion";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Brew from "@shared/types/ability-types/skills/brew";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Illusion from "../groups-spells/illusion";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";
import Witchcraft from "../groups-spells/witchcraft";

export class WitchDefault implements IAbilityGroup {
  static instance: WitchDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.WitchDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Witchcraft.GetInstance().Get<Witchcraft>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      Toss.GetInstance().Get(),
      ApplyPotion.GetInstance().Get(),
      Astrology.GetInstance().Get(),
      Brew.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WitchDefault {
    if (!WitchDefault.instance) {
      WitchDefault.instance = new WitchDefault();
    }
    return WitchDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WitchDefault.GetInstance() as T;
  }
}

export default WitchDefault;
