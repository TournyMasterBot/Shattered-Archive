import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Parry from "@shared/types/ability-types/skills/parry";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Protective from "../groups-spells/protective";
import Transportation from "../groups-spells/transportation";

export class WujenDefault implements IAbilityGroup {
  static instance: WujenDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.WujenDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      Parry.GetInstance(),
      Dodge.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): WujenDefault {
    if (!WujenDefault.instance) {
      WujenDefault.instance = new WujenDefault();
    }
    return WujenDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return WujenDefault.GetInstance() as T;
  }
}

export default WujenDefault;
