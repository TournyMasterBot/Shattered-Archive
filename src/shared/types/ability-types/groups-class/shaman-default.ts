import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import Skewer from "@shared/types/ability-types/skills/skewer";
import Butcher from "@shared/types/ability-types/skills/butcher";
import FindWater from "@shared/types/ability-types/skills/find-water";
import EnhancedSpear from "@shared/types/ability-types/skills/enhanced-spear";
import Benedictions from "@shared/types/ability-types/groups-spells/benedictions";
import Detection from "../groups-spells/detection";
import Maladictions from "../groups-spells/maladictions";
import Protective from "../groups-spells/protective";
import Voodoo from "../groups-spells/voodoo";
import Weather from "../groups-spells/weather";

export class ShamanDefault implements IAbilityGroup {
  static instance: ShamanDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.ShamanDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Voodoo.GetInstance().Get<Voodoo>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Weather.GetInstance().Get<Weather>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Maladictions.GetInstance().Get<Maladictions>().abilities,
      ...Benedictions.GetInstance().Get<Benedictions>().abilities,
      Dodge.GetInstance().Get(),
      Skewer.GetInstance().Get(),
      Butcher.GetInstance().Get(),
      FindWater.GetInstance().Get(),
      EnhancedSpear.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShamanDefault {
    if (!ShamanDefault.instance) {
      ShamanDefault.instance = new ShamanDefault();
    }
    return ShamanDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShamanDefault.GetInstance() as T;
  }
}

export default ShamanDefault;
