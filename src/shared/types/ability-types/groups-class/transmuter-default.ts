import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Alteration from "../groups-spells/alteration";
import Beguiling from "../groups-spells/beguiling";
import Combat from "../groups-spells/combat";
import Detection from "../groups-spells/detection";
import Enchantment from "../groups-spells/enchantment";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Illusion from "../groups-spells/illusion";
import Transportation from "../groups-spells/transportation";
import Astrology from "@shared/types/ability-types/skills/astrology";

export class TransmuterDefault implements IAbilityGroup {
  static instance: TransmuterDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.TransmuterDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Beguiling.GetInstance().Get<Beguiling>().abilities,
      ...Enchantment.GetInstance().Get<Enchantment>().abilities,
      ...Alteration.GetInstance().Get<Alteration>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Illusion.GetInstance().Get<Illusion>().abilities,
      Astrology.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): TransmuterDefault {
    if (!TransmuterDefault.instance) {
      TransmuterDefault.instance = new TransmuterDefault();
    }
    return TransmuterDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return TransmuterDefault.GetInstance() as T;
  }
}

export default TransmuterDefault;
